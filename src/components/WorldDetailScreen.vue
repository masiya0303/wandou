<!-- ============================================================
 wandou v0.9 — 世界详情页
 世界信息 + 玩家角色(导入) + NPC(导入) + 世界书(导入) + API → 启程
============================================================ -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { importWorldBook } from '../utils/worldBookEngine'
import { importNpcJson } from '../utils/npcEngine'
import { sound } from '../utils/sound'

const store = useGameStore()
const error = ref('')
const saving = ref(false)

// ---- 世界信息 ----
const editName = ref(store.worldName)
const editDesc = ref(store.worldDescription)

// ---- 导入文字（三段共用）----
const pcJson = ref(''); const showPc = ref(false); const pcFi = ref<HTMLInputElement | null>(null)
const npcJson = ref(''); const showNpc = ref(false); const npcFi = ref<HTMLInputElement | null>(null)
const wbJson = ref(''); const showWb = ref(false); const wbFi = ref<HTMLInputElement | null>(null)

// ---- 统一导入处理 ----
function handleFile(refKey: string, e: Event) {
  const input = e.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    if (refKey === 'pc') { pcJson.value = reader.result as string; showPc.value = true; importPc() }
    else if (refKey === 'npc') { npcJson.value = reader.result as string; showNpc.value = true; importNpcs() }
    else { wbJson.value = reader.result as string; showWb.value = true; importWb() }
  }
  reader.readAsText(file); input.value = ''
}

function importPc() {
  if (!pcJson.value.trim()) return
  const r = importNpcJson(pcJson.value)
  if (r.success && r.entries.length > 0) {
    const c = r.entries[0]
    const bg = [c.personality, c.appearance, c.role, c.background].filter(Boolean).join('\n')
    store.updateCharacter({ name: c.name || '探险者', age: store.character.age, gender: store.character.gender, background: bg || store.character.background })
    pcJson.value = ''; showPc.value = false
  } else { error.value = '角色卡导入失败' }
}

function importNpcs() {
  if (!npcJson.value.trim()) return
  const r = importNpcJson(npcJson.value)
  if (r.success && r.entries.length > 0) store.addNpcEntries(r.entries)
  npcJson.value = ''; showNpc.value = false
}

function importWb() {
  if (!wbJson.value.trim()) return
  const r = importWorldBook(wbJson.value)
  if (r.success && r.entries.length > 0) store.addWorldBookEntries(r.entries)
  wbJson.value = ''; showWb.value = false
}

// ---- API ----
const apiKey = ref(store.apiConfig.apiKey || '')
const apiUrl = ref(store.apiConfig.baseUrl || 'https://api.openai.com')
const apiModel = ref(store.apiConfig.model || 'gpt-4o-mini')
const showApi = ref(false)

async function handleEnterGame() {
  error.value = ''
  if (!editName.value.trim()) { error.value = '请输入世界名称'; return }
  saving.value = true
  store.updateWorldInfo(editName.value.trim(), editDesc.value.trim())
  store.updateApiConfig({ apiKey: apiKey.value.trim(), baseUrl: apiUrl.value.trim() || 'https://api.openai.com', model: apiModel.value.trim() || 'gpt-4o-mini' })
  await store.autoSave()
  store.startPlaying()
}

async function handleDeleteWorld() {
  if (!confirm(`确定删除世界「${store.worldName}」？此操作不可撤销。`)) return
  await store.deleteWorld(store.currentWorldId!)
  store.phase = 'worldList'
}

function handleExport() {
  sound.click()
  const json = store.exportWorld()
  if (!json) { error.value = '导出失败'; return }
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `${store.worldName || 'world'}.json`; a.click()
  URL.revokeObjectURL(url)
}

async function goBack() {
  saving.value = true
  store.updateWorldInfo(editName.value.trim() || store.worldName, editDesc.value.trim())
  store.updateApiConfig({ apiKey: apiKey.value.trim(), baseUrl: apiUrl.value.trim() || 'https://api.openai.com', model: apiModel.value.trim() || 'gpt-4o-mini' })
  await store.autoSave()
  saving.value = false
  store.previousPhase === 'playing' ? store.phase = 'playing' : store.phase = 'worldList'
}
</script>

<template>
  <div class="screen">
    <div class="bg-base"></div>
    <div class="container">
      <header class="top">
        <button class="btn-back glass-panel" @click="goBack" :disabled="saving">← 返回</button>
        <h1>🪐 {{ store.worldName || '新世界' }}</h1>
        <span></span>
      </header>

      <!-- 📝 世界信息 -->
      <div class="sec glass-panel corner-deco">
        <div class="sec-title"><span class="cn">📝 世界信息</span><span class="en">WORLD INFO</span></div>
        <input v-model="editName" class="fi" placeholder="世界名称" />
        <textarea v-model="editDesc" class="fi ta" rows="2" placeholder="世界描述..."></textarea>
      </div>

      <!-- 🎭 玩家角色 -->
      <div class="sec glass-panel corner-deco">
        <div class="sec-title"><span class="cn">🎭 玩家角色</span><span class="en">PLAYER</span><span class="badge" v-if="store.character.name">{{ store.character.name }}</span></div>
        <div class="btns"><button class="act" @click="showPc = !showPc">📥 导入</button><button class="act" @click="pcFi?.click()">📁 文件</button><input ref="pcFi" type="file" accept=".json" hidden @change="handleFile('pc', $event)" /></div>
        <div v-if="showPc" class="imp"><textarea v-model="pcJson" class="ta" placeholder="粘贴角色卡 JSON..." rows="2"></textarea><button class="act go" @click="importPc" :disabled="!pcJson.trim()">导入</button></div>
        <div v-if="store.character.name" class="char-card glass-panel corner-deco"><span class="cc-name">{{ store.character.name }}</span><p v-if="store.character.background" class="cc-bg">{{ store.character.background }}</p></div>
        <div v-else class="empty">导入角色卡 JSON 设置玩家角色</div>
      </div>

      <!-- 👥 NPC -->
      <div class="sec glass-panel corner-deco">
        <div class="sec-title"><span class="cn">👥 NPC 角色书</span><span class="en">NPC CARDS</span><span class="badge">{{ store.npcs.filter(n=>n.enabled).length }}/{{ store.npcs.length }}</span></div>
        <div class="btns"><button class="act" @click="showNpc = !showNpc">📥 导入</button><button class="act" @click="npcFi?.click()">📁 文件</button><input ref="npcFi" type="file" accept=".json" hidden @change="handleFile('npc', $event)" /></div>
        <div v-if="showNpc" class="imp"><textarea v-model="npcJson" class="ta" placeholder="粘贴 NPC JSON..." rows="2"></textarea><button class="act go" @click="importNpcs" :disabled="!npcJson.trim()">导入</button></div>
        <div v-if="store.npcs.length === 0" class="empty">暂无 NPC</div>
        <div v-for="n in store.npcs" :key="n.id" :class="['entry', { off: !n.enabled }]">
          <div class="er"><button class="tg" @click="store.toggleNpc(n.id)">{{ n.enabled ? '✅' : '⛔' }}</button><div class="ei"><span class="enm">{{ n.name }}</span><span v-if="n.role" class="erl">{{ n.role }}</span></div><button class="edel" @click="store.removeNpc(n.id)">🗑️</button></div>
        </div>
      </div>

      <!-- 📖 世界书 -->
      <div class="sec glass-panel corner-deco">
        <div class="sec-title"><span class="cn">📖 世界书</span><span class="en">WORLD BOOK</span><span class="badge">{{ store.worldBook.filter(e=>e.enabled).length }}/{{ store.worldBook.length }}</span></div>
        <div class="btns"><button class="act" @click="showWb = !showWb">📥 导入</button><button class="act" @click="wbFi?.click()">📁 文件</button><input ref="wbFi" type="file" accept=".json" hidden @change="handleFile('wb', $event)" /></div>
        <div v-if="showWb" class="imp"><textarea v-model="wbJson" class="ta" placeholder="粘贴世界书 JSON..." rows="2"></textarea><button class="act go" @click="importWb" :disabled="!wbJson.trim()">导入</button></div>
        <div v-if="store.worldBook.length === 0" class="empty">暂无世界书条目</div>
        <div v-for="e in store.worldBook" :key="e.id" :class="['entry', { off: !e.enabled }]">
          <div class="er"><button class="tg" @click="store.toggleWorldBookEntry(e.id)">{{ e.enabled ? '✅' : '⛔' }}</button><div class="ei"><span class="enm">{{ e.comment || '未命名' }}</span></div><span class="pri">{{ e.position === 'at_constant' ? '📌' : '#'+e.priority }}</span><button class="edel" @click="store.removeWorldBookEntry(e.id)">🗑️</button></div>
        </div>
      </div>

      <!-- 🔌 API -->
      <div class="sec glass-panel corner-deco">
        <div class="sec-title clickable" @click="showApi = !showApi"><span class="cn">🔌 API 配置</span><span class="en">API CONFIG</span><span class="badge">{{ apiKey ? '●●●' + apiKey.slice(-4) : '未配置' }}</span></div>
        <div v-if="showApi">
          <input v-model="apiKey" type="password" class="fi" placeholder="API Key (sk-...)" />
          <div class="fi-row"><input v-model="apiUrl" class="fi flex-2" placeholder="https://api.openai.com" /><input v-model="apiModel" class="fi flex-1" placeholder="gpt-4o-mini" /></div>
        </div>
      </div>

      <p v-if="error" class="err">{{ error }}</p>
      <div class="bottom">
        <button class="btn-enter corner-deco" @click="handleEnterGame" :disabled="saving"><span class="cn">{{ saving ? '⏳ 保存中...' : '🚀 启程' }}</span><span class="en">START ADVENTURE</span></button>
        <button class="btn-exp" @click="handleExport">📤 导出世界</button>
        <button class="btn-del" @click="handleDeleteWorld">🗑️ 删除世界</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen { height: 100vh; position: relative; overflow-y: auto; overflow-x: hidden; background: url('/splash-bg.png') center/cover no-repeat; }
.bg-base { display: none; }
.container { position: relative; z-index: 1; max-width: 640px; width: 100%; margin: 0 auto; padding: 1rem 1.2rem 2rem; display: flex; flex-direction: column; gap: 0.6rem; }

.top { display: flex; align-items: center; justify-content: space-between; }
.top h1 { font-size: 20px; color: var(--text-primary); margin: 0; }
.btn-back { padding: 0.4rem 0.8rem; border-radius: 9999px; border: 1px solid var(--glass-border); color: var(--text-secondary); font-size: 11px; cursor: pointer; font-family: inherit; background: none; }
.btn-back:disabled { opacity: 0.4; }

.sec { padding: 0.8rem; border-radius: 16px; }
.sec-title { display: flex; align-items: baseline; gap: 0.3rem; margin-bottom: 0.4rem; }
.clickable { cursor: pointer; }
.cn { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.en { font-size: 11px; color: var(--text-muted); letter-spacing: 0.1em; }
.badge { font-size: 11px; color: var(--text-muted); margin-left: auto; }

.fi { width: 100%; padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: 10px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 14px; font-family: inherit; box-sizing: border-box; margin-bottom: 0.3rem; }
.fi:focus { outline: none; border-color: var(--color-primary); }
.ta { resize: vertical; min-height: 36px; }
.fi-row { display: flex; gap: 0.3rem; }
.flex-1 { flex: 1; } .flex-2 { flex: 2; }

.btns { display: flex; gap: 0.25rem; margin-bottom: 0.3rem; }
.act { padding: 0.2rem 0.5rem; border-radius: 9999px; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-secondary); font-size: 11px; cursor: pointer; font-family: inherit; }
.act:active { transform: scale(0.96); }
.go { background: rgba(167,139,250,0.1); border-color: rgba(167,139,250,0.25); color: var(--color-primary); }
.go:disabled { opacity: 0.3; }
.imp { display: flex; flex-direction: column; gap: 0.2rem; margin-bottom: 0.3rem; padding: 0.4rem; background: rgba(8,16,28,0.4); border-radius: 10px; }
.imp .ta { width: 100%; padding: 0.4rem; border: 1px solid var(--border); border-radius: 10px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 11px; font-family: monospace; resize: vertical; box-sizing: border-box; }

.char-card { padding: 0.6rem 0.7rem; border-radius: 10px; }
.cc-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.cc-bg { font-size: 11px; color: var(--text-secondary); line-height: 1.5; margin: 0.2rem 0 0; white-space: pre-wrap; }

.empty { text-align: center; padding: 0.5rem; font-size: 11px; color: var(--text-muted); }
.entry { padding: 0.4rem 0.5rem; border-radius: 10px; background: rgba(8,16,28,0.25); margin-bottom: 0.25rem; transition: transform 0.2s; }
.entry:active { transform: scale(0.98); }
.entry.off { opacity: 0.4; }
.er { display: flex; align-items: center; gap: 0.25rem; }
.tg { background: none; border: none; font-size: 0.8rem; cursor: pointer; padding: 0; }
.ei { flex: 1; display: flex; flex-direction: column; gap: 0.02rem; }
.enm { font-size: 11px; font-weight: 600; color: var(--text-primary); }
.erl { font-size: 11px; color: var(--accent-cyan); }
.pri { font-size: 11px; color: var(--text-muted); }
.edel { background: none; border: none; cursor: pointer; font-size: 0.7rem; opacity: 0.3; padding: 0; }

.err { color: #e55; font-size: 11px; text-align: center; margin: 0; }

.bottom { display: flex; flex-direction: column; gap: 0.4rem; align-items: center; padding-top: 0.5rem; }
.btn-enter { width: 100%; padding: 0.6rem; border: 1px solid var(--color-primary); border-radius: 9999px; background: rgba(167,139,250,0.08); color: #e0e0ff; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; align-items: center; gap: 0.02rem; transition: all 0.3s; }
.btn-enter:active:not(:disabled) { transform: scale(0.97); }
.btn-enter:disabled { opacity: 0.5; }
.btn-enter .cn { font-size: 16px; font-weight: 600; }
.btn-enter .en { font-size: 11px; letter-spacing: 0.15em; color: var(--color-primary); }
.btn-exp { padding: 0.4rem 1rem; border: 1px solid var(--accent-cyan); border-radius: 9999px; background: rgba(0,229,255,0.06); color: var(--accent-cyan); font-size: 11px; cursor: pointer; font-family: inherit; margin-bottom: 0.4rem; }
.btn-exp:active { background: rgba(0,229,255,0.15); }
.btn-del { padding: 0.4rem 1rem; border: 1px solid #5f1e1e; border-radius: 9999px; background: transparent; color: #8b4a4a; font-size: 11px; cursor: pointer; font-family: inherit; }
.btn-del:active { background: rgba(120,30,30,0.25); }
</style>
