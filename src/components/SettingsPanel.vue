<!-- wandou · 设置面板 -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import WorldBookManager from './WorldBookManager.vue'

const store = useGameStore()
const emit = defineEmits<{ close: [] }>()
const hasActiveGame = computed(() => store.messages.length > 0)
const page = ref<string | null>(null)

// ---- edits ----
const editApiKey = ref(store.apiConfig.apiKey)
const editBaseUrl = ref(store.apiConfig.baseUrl)
const editModel = ref(store.apiConfig.model)
const editTemperature = ref(store.apiConfig.temperature)
const editMaxTokens = ref(store.apiConfig.maxTokens)
const editSystemPrompt = ref(store.systemPrompt)
const saved = ref(false)

// ---- theme ----
const themeJson = ref('')
const themeMsg = ref('')

function handleSave() {
  store.updateApiConfig({ apiKey: editApiKey.value, baseUrl: editBaseUrl.value, model: editModel.value, temperature: editTemperature.value, maxTokens: editMaxTokens.value })
  store.updateSystemPrompt(editSystemPrompt.value)
  saved.value = true; setTimeout(() => saved.value = false, 2000)
}
async function handleSaveGame() {
  try { await store.autoSave(); saved.value = true; setTimeout(() => saved.value = false, 2000) } catch {}
}

function themeDesc() {
  if (store.themeId === 'bjd-pink') return '当前：bjd粉色'
  if (store.themeId === 'wandou-dark') return '当前：wandou暗色'
  return '当前：自定义主题'
}

function handleThemeImport() {
  themeMsg.value = ''
  if (!themeJson.value.trim()) return
  const ok = store.importThemeJson(themeJson.value)
  themeMsg.value = ok ? '✅ 主题已应用' : '❌ JSON 解析失败'
  if (ok) themeJson.value = ''
}

const CARDS = [
  { key: 'api', icon: '🔌', cn: 'API 配置', en: 'API CONFIG', desc: 'LLM 接口、密钥、模型' },
  { key: 'prompt', icon: '📜', cn: '系统提示词', en: 'SYSTEM PROMPT', desc: 'AI 世界观、风格和行为' },
  { key: 'worldbook', icon: '📖', cn: '全局世界书', en: 'GLOBAL WB', desc: '所有世界通用的背景知识' },
  { key: 'theme', icon: '🎨', cn: '聊天主题', en: 'THEME', desc: '' },
]

function goBack() { page.value = null }
</script>

<template>
  <div class="ss">
    <div class="ss-bg"></div>

    <!-- home -->
    <div v-if="page === null" class="ss-main">
      <header class="ss-head">
        <span></span>
        <div class="ss-title"><h1>⚙️ 设置</h1><p>SETTINGS</p></div>
        <button class="ss-close" @click="emit('close')">✕</button>
      </header>
      <div class="card-grid">
        <button v-for="c in CARDS" :key="c.key" class="s-card glass-panel" @click="page = c.key">
          <span class="s-icon">{{ c.icon }}</span>
          <div class="s-labels"><span class="s-cn">{{ c.cn }}</span><span class="s-en">{{ c.en }}</span></div>
          <p class="s-desc">{{ c.key === 'theme' ? themeDesc() : c.desc }}</p>
          <span class="s-arrow">→</span>
        </button>
      </div>
      <div class="ss-foot">
        <button v-if="hasActiveGame" class="ss-btn" @click="handleSaveGame">💾 手动存档</button>
        <button class="ss-btn" @click="handleSave">保存设置</button>
        <span v-if="saved" style="font-size:12px;color:var(--success);margin-left:8px">✅ 已保存</span>
      </div>
    </div>

    <!-- sub -->
    <div v-if="page" class="sub">
      <header class="sub-head">
        <button class="sub-back" @click="goBack">← 返回</button>
        <h2>{{ {api:'🔌 API 配置',prompt:'📜 系统提示词',worldbook:'📖 全局世界书',theme:'🎨 聊天主题'}[page] }}</h2>
        <span></span>
      </header>
      <div class="sub-body">

        <!-- API -->
        <div v-if="page === 'api'" class="form-card glass-panel">
          <div class="fg"><label>API Key <span class="l-en">AUTH</span></label><input v-model="editApiKey" type="password" class="fi" placeholder="sk-..." /></div>
          <div class="fg"><label>API 地址 <span class="l-en">ENDPOINT</span></label><input v-model="editBaseUrl" type="text" class="fi" /></div>
          <div class="fg"><label>模型 <span class="l-en">MODEL</span></label><input v-model="editModel" type="text" class="fi" /></div>
          <div class="fg-row">
            <div class="fg" style="flex:1"><label>温度 {{ editTemperature }}</label><input v-model.number="editTemperature" type="range" min="0" max="2" step="0.1" style="width:100%;accent-color:var(--pink-accent)" /></div>
            <div class="fg" style="flex:1"><label>Max Tokens</label><input v-model.number="editMaxTokens" type="number" class="fi" min="256" max="128000" /></div>
          </div>
          <button class="sub-save" @click="handleSave">保存</button>
        </div>

        <!-- Prompt -->
        <div v-if="page === 'prompt'" class="form-card glass-panel">
          <p style="font-size:12px;color:var(--pink-primary);margin:0 0 12px">提示词决定 AI 的世界观、风格和行为。</p>
          <div class="fg"><textarea v-model="editSystemPrompt" class="fi fi-ta" rows="22" style="font-family:monospace;font-size:12px"></textarea></div>
          <button class="sub-save" @click="handleSave">保存</button>
        </div>

        <!-- WorldBook -->
        <div v-if="page === 'worldbook'" class="form-card glass-panel">
          <WorldBookManager />
        </div>

        <!-- Theme -->
        <div v-if="page === 'theme'" class="form-card glass-panel">
          <p style="font-size:13px;color:var(--pink-primary);margin:0 0 16px">点击预设主题，或粘贴 ST 主题 JSON 导入自定义主题。</p>

          <div style="display:flex;gap:10px;margin-bottom:16px">
            <button class="theme-btn" :class="{active:store.themeId==='bjd-pink'}" @click="store.applyTheme('bjd-pink')">🎀 bjd粉色</button>
            <button class="theme-btn" :class="{active:store.themeId==='wandou-dark'}" @click="store.applyTheme('wandou-dark')">🌑 wandou暗色</button>
          </div>

          <hr style="border:1px solid var(--pink-ice);margin:0 0 16px" />

          <div class="fg">
            <label>导入主题 JSON <span class="l-en">IMPORT</span></label>
            <textarea v-model="themeJson" class="fi fi-ta" rows="8" placeholder="粘贴 SillyTavern 主题 JSON..." style="font-family:monospace;font-size:12px"></textarea>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <button class="sub-save" style="margin-top:0;width:auto;padding:9px 20px" @click="handleThemeImport">导入并应用</button>
            <span v-if="themeMsg" :style="{fontSize:'12px',color:themeMsg.startsWith('✅')?'var(--success)':'var(--danger)'}">{{ themeMsg }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---- overlay ---- */
.ss { position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column; overflow: hidden; background: var(--theme-chat-bg) center/cover no-repeat; }


/* ---- home ---- */
.ss-main { position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%; padding: 16px; }
.ss-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 0 4px; flex-shrink: 0; }
.ss-title h1 { font-size: 22px; font-weight: 700; color: #e0e8ff; margin: 0; }
.ss-title p { font-size: 11px; color: var(--pink-light); letter-spacing: 0.2em; margin: 2px 0 0; }
.ss-close { width: 36px; height: 36px; border-radius: 50%; font-size: 16px; color: var(--pink-primary); cursor: pointer; border: 1px solid var(--pink-ice); background: rgba(255,255,255,0.5); display: flex; align-items: center; justify-content: center; }
.ss-close:active { background: rgba(255,128,168,0.1); color: var(--pink-accent); }

/* ---- cards ---- */
.card-grid { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 12px 0; align-content: center; max-width: 640px; width: 100%; margin: 0 auto; }
.s-card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px 16px; border-radius: 20px; cursor: pointer; font-family: inherit; text-align: center; transition: all 0.3s; position: relative; min-height: 150px; background: rgba(255,255,255,0.6); border: 1px solid var(--pink-ice); }
.s-card:active { transform: translateY(-3px); border-color: var(--pink-accent); box-shadow: 0 8px 25px rgba(255,128,168,0.18); }
.s-icon { font-size: 30px; }
.s-labels { display: flex; flex-direction: column; gap: 2px; }
.s-cn { font-size: 15px; font-weight: 600; color: var(--pink-primary); }
.s-en { font-size: 9px; color: var(--pink-primary); opacity: 0.45; letter-spacing: 0.12em; }
.s-desc { font-size: 10px; color: var(--pink-primary); opacity: 0.45; margin: 0; line-height: 1.4; max-width: 180px; }
.s-arrow { position: absolute; top: 10px; right: 14px; font-size: 14px; color: var(--pink-primary); opacity: 0.35; transition: all 0.3s; }
.s-card:active .s-arrow { opacity: 0.8; transform: translateX(3px); }

/* ---- foot ---- */
.ss-foot { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 10px 0; flex-shrink: 0; }
.ss-btn { padding: 8px 18px; border-radius: 20px; border: 1px solid var(--pink-ice); background: rgba(255,255,255,0.5); color: var(--pink-primary); font-size: 12px; cursor: pointer; font-family: inherit; transition: all 0.2s; }
.ss-btn:active { background: var(--pink-ice); border-color: var(--pink-light); }

/* ---- sub ---- */
.sub { position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%; }
.sub-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; flex-shrink: 0; border-bottom: 1px solid var(--pink-ice); }
.sub-head h2 { font-size: 18px; color: #e0e8ff; margin: 0; }
.sub-back { padding: 6px 14px; border-radius: 20px; border: 1px solid var(--pink-ice); background: rgba(255,255,255,0.5); color: var(--pink-primary); font-size: 12px; cursor: pointer; font-family: inherit; }
.sub-back:active { background: var(--pink-ice); }
.sub-body { flex: 1; overflow-y: auto; padding: 16px 0; max-width: 540px; width: 100%; margin: 0 auto; }

/* ---- form ---- */
.form-card { padding: 20px; border-radius: 16px; background: rgba(255,255,255,0.55); border: 1px solid var(--pink-ice); }
.fg { margin-bottom: 14px; }
.fg label { display: block; font-size: 12px; color: var(--pink-primary); margin-bottom: 4px; font-weight: 500; }
.l-en { font-size: 8px; color: var(--pink-primary); opacity: 0.35; letter-spacing: 0.1em; margin-left: 4px; }
.fi { width: 100%; padding: 9px 11px; border: 1px solid var(--pink-ice); border-radius: 10px; background: rgba(255,255,255,0.5); color: var(--pink-primary); font-size: 14px; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s; }
.fi:focus { outline: none; border-color: var(--pink-accent); box-shadow: 0 0 0 2px rgba(255,128,168,0.08); }
.fi-ta { resize: vertical; min-height: 60px; }
.fg-row { display: flex; gap: 12px; }
.sub-save { width: 100%; margin-top: 8px; padding: 10px; border: none; border-radius: 20px; background: var(--pink-accent); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.2s; }
.sub-save:active { transform: scale(0.97); opacity: 0.9; }

/* ---- theme buttons ---- */
.theme-btn { padding: 10px 18px; border: 2px solid var(--pink-ice); border-radius: 20px; background: rgba(255,255,255,0.5); color: var(--pink-primary); font-size: 14px; cursor: pointer; font-family: inherit; transition: all 0.2s; flex: 1; }
.theme-btn.active { border-color: var(--pink-accent); color: var(--pink-accent); background: rgba(255,128,168,0.08); }
.theme-btn:active { transform: scale(0.97); }

@media (max-width: 500px) { .card-grid { grid-template-columns: 1fr; gap: 10px; } .s-card { min-height: 100px; padding: 18px 12px; } }
</style>
