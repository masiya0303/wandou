<!-- ============================================================
 wandou v0.9 — 世界详情页（一站式）
 世界信息 + 玩家角色 + NPC + 世界书 + API → 直接进游戏
============================================================ -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { importWorldBook } from '../utils/worldBookEngine'
import { importNpcJson } from '../utils/npcEngine'

const store = useGameStore()
const saving = ref(false)
const error = ref('')

// ---- 世界信息 ----
const editName = ref(store.worldName)
const editDesc = ref(store.worldDescription)

// ---- 玩家角色 ----
const charName = ref(store.character.name || '')
const charAge = ref(store.character.age || 25)
const charGender = ref(store.character.gender || '')
const charBg = ref(store.character.background || '')
const charImportText = ref('')
const showCharImport = ref(false)
const charFileInput = ref<HTMLInputElement | null>(null)

function importPlayerChar() {
  if (!charImportText.value.trim()) return
  const r = importNpcJson(charImportText.value)
  if (r.success && r.entries.length > 0) {
    const npc = r.entries[0]
    if (npc.name && !charName.value) charName.value = npc.name
    if (npc.personality && !charBg.value) charBg.value = npc.personality.slice(0, 500)
    if (npc.appearance) charBg.value = (charBg.value + '\n外貌: ' + npc.appearance).trim()
    if (npc.background) charBg.value = (charBg.value + '\n' + npc.background).trim()
    if (npc.scenario) charBg.value = (charBg.value + '\n场景: ' + npc.scenario).trim()
    charImportText.value = ''
    showCharImport.value = false
  }
}
function onCharFile(e: Event) {
  const input = e.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = () => { charImportText.value = reader.result as string; showCharImport.value = true; importPlayerChar() }
  reader.readAsText(file); input.value = ''
}

// ---- NPC ----
const npcImportText = ref('')
const showNpcImport = ref(false)
const npcFileInput = ref<HTMLInputElement | null>(null)
function importNpcs() {
  if (!npcImportText.value.trim()) return
  const r = importNpcJson(npcImportText.value)
  if (r.success && r.entries.length > 0) store.addNpcEntries(r.entries)
  if (r.imported > 0) npcImportText.value = ''
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
  const r = importWorldBook(wbImportText.value)
  if (r.success && r.entries.length > 0) store.addWorldBookEntries(r.entries)
  if (r.imported > 0) wbImportText.value = ''
}
function onWbFile(e: Event) {
  const input = e.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = () => { wbImportText.value = reader.result as string; showWbImport.value = true; importWb() }
  reader.readAsText(file); input.value = ''
}

// ---- API ----
const apiKey = ref(store.apiConfig.apiKey || '')
const apiUrl = ref(store.apiConfig.baseUrl || 'https://api.openai.com')
const apiModel = ref(store.apiConfig.model || 'gpt-4o-mini')
const showApi = ref(false)

// ---- 进入游戏 ----
async function handleEnterGame() {
  error.value = ''
  if (!editName.value.trim()) { error.value = '请输入世界名称'; return }

  saving.value = true

  // 保存全部
  store.updateWorldInfo(editName.value.trim(), editDesc.value.trim())
  store.updateCharacter({
    name: charName.value.trim() || '探险者',
    age: charAge.value,
    gender: charGender.value,
    background: charBg.value.trim(),
  })
  store.updateApiConfig({
    apiKey: apiKey.value.trim(),
    baseUrl: apiUrl.value.trim() || 'https://api.openai.com',
    model: apiModel.value.trim() || 'gpt-4o-mini',
  })
  await store.autoSave()
  store.startPlaying()
  saving.value = false
}

async function handleDeleteWorld() {
  if (!confirm(`确定删除世界「${store.worldName}」？此操作不可撤销。`)) return
  await store.deleteWorld(store.currentWorldId!)
  store.phase = 'worldList'
}

async function goBack() {
  saving.value = true
  store.updateWorldInfo(editName.value.trim() || store.worldName, editDesc.value.trim())
  store.updateCharacter({
    name: charName.value.trim(),
    age: charAge.value,
    gender: charGender.value,
    background: charBg.value.trim(),
  })
  store.updateApiConfig({
    apiKey: apiKey.value.trim(),
    baseUrl: apiUrl.value.trim() || 'https://api.openai.com',
    model: apiModel.value.trim() || 'gpt-4o-mini',
  })
  await store.autoSave()
  saving.value = false
  store.previousPhase === 'playing' ? store.phase = 'playing' : store.phase = 'worldList'
}
</script>

<template>
  <div class="screen">
    <div class="bg-base"></div>
    <div class="container">
      <!-- 顶部 -->
      <header class="top">
        <button class="btn-back glass-panel" @click="goBack" :disabled="saving">← 返回</button>
        <h1>🪐 {{ store.worldName || '新世界' }}</h1>
        <span></span>
      </header>

      <!-- 世界信息 -->
      <div class="sec glass-panel corner-deco">
        <div class="sec-title"><span class="cn">📝 世界信息</span><span class="en">WORLD INFO</span></div>
        <input v-model="editName" class="fi" placeholder="世界名称（必填）" />
        <textarea v-model="editDesc" class="fi ta" rows="2" placeholder="世界描述..."></textarea>
      </div>

      <!-- 玩家角色 -->
      <div class="sec glass-panel corner-deco">
        <div class="sec-title">
          <span class="cn">🎭 玩家角色</span><span class="en">PLAYER CHARACTER</span>
        </div>
        <div class="sec-acts">
          <button class="act" @click="showCharImport = !showCharImport">📥 导入角色</button>
          <button class="act" @click="charFileInput?.click()">📁 文件</button>
          <input ref="charFileInput" type="file" accept=".json" style="display:none" @change="onCharFile" />
        </div>
        <div v-if="showCharImport" class="imp-area">
          <textarea v-model="charImportText" class="ta" placeholder="粘贴角色卡 JSON..." rows="2"></textarea>
          <button class="act go" @click="importPlayerChar" :disabled="!charImportText.trim()">导入</button>
        </div>
        <div class="fi-row">
          <input v-model="charName" class="fi flex-2" placeholder="角色姓名" />
          <input v-model.number="charAge" type="number" class="fi flex-1" placeholder="年龄" min="1" />
          <select v-model="charGender" class="fi flex-1">
            <option value="">性别</option><option value="male">男</option><option value="female">女</option><option value="other">其他</option>
          </select>
        </div>
        <textarea v-model="charBg" class="fi ta" rows="2" placeholder="角色背景..."></textarea>
      </div>

      <!-- NPC -->
      <div class="sec glass-panel corner-deco">
        <div class="sec-title">
          <span class="cn">👥 NPC 角色书</span><span class="en">NPC CHARACTERS</span>
          <span class="badge">{{ store.npcs.filter(n=>n.enabled).length }}/{{ store.npcs.length }}</span>
        </div>
        <div class="sec-acts">
          <button class="act" @click="showNpcImport = !showNpcImport">📥 导入</button>
          <button class="act" @click="npcFileInput?.click()">📁 文件</button>
          <input ref="npcFileInput" type="file" accept=".json" style="display:none" @change="onNpcFile" />
        </div>
        <div v-if="showNpcImport" class="imp-area">
          <textarea v-model="npcImportText" class="ta" placeholder="粘贴 NPC JSON..." rows="2"></textarea>
          <button class="act go" @click="importNpcs" :disabled="!npcImportText.trim()">导入</button>
        </div>
        <div v-if="store.npcs.length === 0" class="empty">暂无 NPC</div>
        <div v-for="n in store.npcs" :key="n.id" :class="['entry', { off: !n.enabled }]">
          <div class="er">
            <button class="tg" @click="store.toggleNpc(n.id)">{{ n.enabled ? '✅' : '⛔' }}</button>
            <div class="ei"><span class="enm">{{ n.name }}</span><span v-if="n.role" class="erl">{{ n.role }}</span></div>
            <button class="edel" @click="store.removeNpc(n.id)">🗑️</button>
          </div>
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
          <textarea v-model="wbImportText" class="ta" placeholder="粘贴世界书 JSON..." rows="2"></textarea>
          <button class="act go" @click="importWb" :disabled="!wbImportText.trim()">导入</button>
        </div>
        <div v-if="store.worldBook.length === 0" class="empty">暂无世界书条目</div>
        <div v-for="e in store.worldBook" :key="e.id" :class="['entry', { off: !e.enabled }]">
          <div class="er">
            <button class="tg" @click="store.toggleWorldBookEntry(e.id)">{{ e.enabled ? '✅' : '⛔' }}</button>
            <div class="ei"><span class="enm">{{ e.comment || '（未命名）' }}</span></div>
            <button class="edel" @click="store.removeWorldBookEntry(e.id)">🗑️</button>
          </div>
        </div>
      </div>

      <!-- API -->
      <div class="sec glass-panel corner-deco">
        <div class="sec-title clickable" @click="showApi = !showApi">
          <span class="cn">🔌 API 配置</span><span class="en">API CONFIG</span>
          <span class="badge">{{ apiKey ? '●●●' + apiKey.slice(-4) : '未配置' }}</span>
        </div>
        <div v-if="showApi">
          <input v-model="apiKey" type="password" class="fi" placeholder="API Key (sk-...)" />
          <div class="fi-row">
            <input v-model="apiUrl" class="fi flex-2" placeholder="https://api.openai.com" />
            <input v-model="apiModel" class="fi flex-1" placeholder="gpt-4o-mini" />
          </div>
        </div>
      </div>

      <!-- 底部 -->
      <p v-if="error" class="err">{{ error }}</p>
      <div class="bottom">
        <button class="btn-enter corner-deco" @click="handleEnterGame" :disabled="saving">
          <span class="cn">{{ saving ? '⏳ 保存中...' : '🚀 启程' }}</span>
          <span class="en">START ADVENTURE</span>
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
.container { position: relative; z-index: 1; max-width: 640px; width: 100%; margin: 0 auto; padding: 1rem 1.2rem 2rem; display: flex; flex-direction: column; gap: 0.6rem; }

.top { display: flex; align-items: center; justify-content: space-between; }
.top h1 { font-size: 1.25rem; color: var(--text-primary); margin: 0; }
.btn-back { padding: 0.3rem 0.6rem; border-radius: 6px; border: 1px solid var(--glass-border); color: var(--text-secondary); font-size: 0.75rem; cursor: pointer; font-family: inherit; }
.btn-back:disabled { opacity: 0.4; }

.sec { padding: 0.6rem 0.7rem; border-radius: 10px; }
.sec-title { display: flex; align-items: baseline; gap: 0.3rem; margin-bottom: 0.4rem; }
.clickable { cursor: pointer; }
.cn { font-size: 0.78rem; font-weight: 600; color: var(--text-primary); }
.en { font-size: 0.48rem; color: var(--text-muted); letter-spacing: 0.1em; }
.badge { font-size: 0.58rem; color: var(--text-muted); margin-left: auto; }

.fi { width: 100%; padding: 0.4rem 0.5rem; border: 1px solid var(--border); border-radius: 5px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 0.82rem; font-family: inherit; box-sizing: border-box; margin-bottom: 0.3rem; }
.fi:focus { outline: none; border-color: var(--accent-cyan); }
.ta { resize: vertical; min-height: 36px; }
.fi-row { display: flex; gap: 0.3rem; }
.flex-1 { flex: 1; } .flex-2 { flex: 2; }

.sec-acts { display: flex; gap: 0.25rem; margin-bottom: 0.3rem; }
.act { padding: 0.18rem 0.45rem; border-radius: 4px; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-secondary); font-size: 0.62rem; cursor: pointer; font-family: inherit; }
.act:hover { border-color: var(--accent); color: var(--text-primary); }
.go { background: rgba(0,229,255,0.08); border-color: rgba(0,229,255,0.25); color: var(--accent-cyan); }
.go:disabled { opacity: 0.3; }

.imp-area { display: flex; flex-direction: column; gap: 0.2rem; margin-bottom: 0.3rem; padding: 0.3rem; background: rgba(8,16,28,0.4); border-radius: 5px; }
.ta { width: 100%; padding: 0.3rem; border: 1px solid var(--border); border-radius: 4px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 0.62rem; font-family: monospace; resize: vertical; box-sizing: border-box; }

.empty { text-align: center; padding: 0.5rem; font-size: 0.65rem; color: var(--text-muted); }
.entry { padding: 0.3rem 0.4rem; border-radius: 5px; background: rgba(8,16,28,0.25); margin-bottom: 0.2rem; }
.entry.off { opacity: 0.4; }
.er { display: flex; align-items: center; gap: 0.25rem; }
.tg { background: none; border: none; font-size: 0.7rem; cursor: pointer; padding: 0; }
.ei { flex: 1; display: flex; flex-direction: column; gap: 0.02rem; }
.enm { font-size: 0.7rem; font-weight: 600; color: var(--text-primary); }
.erl { font-size: 0.55rem; color: var(--accent-cyan); }
.edel { background: none; border: none; cursor: pointer; font-size: 0.6rem; opacity: 0.3; }
.edel:hover { opacity: 1; }

.err { color: #e55; font-size: 0.72rem; text-align: center; margin: 0; }

.bottom { display: flex; flex-direction: column; gap: 0.35rem; align-items: center; padding-top: 0.3rem; }
.btn-enter { width: 100%; padding: 0.55rem; border: 1px solid var(--accent-cyan); border-radius: 8px; background: rgba(0,229,255,0.08); color: #e0f0ff; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; align-items: center; gap: 0.02rem; transition: all 0.3s; }
.btn-enter:hover:not(:disabled) { background: rgba(0,229,255,0.18); box-shadow: 0 0 20px var(--accent-cyan-glow); transform: translateY(-2px); }
.btn-enter:disabled { opacity: 0.5; }
.btn-enter .cn { font-size: 0.9rem; font-weight: 600; }
.btn-enter .en { font-size: 0.5rem; letter-spacing: 0.15em; color: var(--accent-cyan); }
.btn-del { padding: 0.3rem 0.8rem; border: 1px solid #5f1e1e; border-radius: 5px; background: transparent; color: #8b4a4a; font-size: 0.7rem; cursor: pointer; font-family: inherit; }
.btn-del:hover { background: rgba(120,30,30,0.25); color: #e66; }
</style>
