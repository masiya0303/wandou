<!-- wandou · 设置面板 — 点击卡片展开详情/编辑 -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'
import { useApiStore } from '@/stores/apiStore'
import { useThemeStore } from '@/stores/themeStore'
import { useChatStore } from '@/stores/chatStore'
import WorldBookManager from './WorldBookManager.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'
import { useExtensionStore } from '@/stores/extensionStore'
import { MARKETPLACE } from '@/marketplace'

const router = useRouter()
const game = useGameStore()
const api = useApiStore()
const theme = useThemeStore()
const chat = useChatStore()
const extStore = useExtensionStore()

const hasActiveGame = computed(() => chat.messages.length > 0)

// 展开的卡片 key（null = 首页卡片网格）
const expandedKey = ref<string | null>(null)

// ---- edits ----
const editApiKey = ref(api.apiConfig.apiKey)
const editBaseUrl = ref(api.apiConfig.baseUrl)
const editModel = ref(api.apiConfig.model)
const editTemperature = ref(api.apiConfig.temperature)
const editMaxTokens = ref(api.apiConfig.maxTokens)
const editSystemPrompt = ref(api.systemPrompt)
const saved = ref(false)

// ---- preset ----
const presetName = ref('')
const presetMsg = ref('')
const presets = ref(api.getPresets())

function handleSavePreset() {
  if (!presetName.value.trim()) return
  api.savePreset(presetName.value.trim())
  presets.value = api.getPresets()
  presetName.value = ''
  presetMsg.value = '✅ 已保存'
  setTimeout(() => presetMsg.value = '', 2000)
}

function handleApplyPreset(name: string) {
  api.applyPreset(name)
  editApiKey.value = api.apiConfig.apiKey
  editBaseUrl.value = api.apiConfig.baseUrl
  editModel.value = api.apiConfig.model
  editTemperature.value = api.apiConfig.temperature
  editMaxTokens.value = api.apiConfig.maxTokens
  editSystemPrompt.value = api.systemPrompt
  saved.value = true; setTimeout(() => saved.value = false, 2000)
}

function handleDeletePreset(name: string) {
  api.deletePreset(name)
  presets.value = api.getPresets()
}

// ---- theme ----
const themeJson = ref('')
const themeMsg = ref('')

function handleSave() {
  api.updateApiConfig({ apiKey: editApiKey.value, baseUrl: editBaseUrl.value, model: editModel.value, temperature: editTemperature.value, maxTokens: editMaxTokens.value })
  api.updateSystemPrompt(editSystemPrompt.value)
  saved.value = true; setTimeout(() => saved.value = false, 2000)
}

async function handleSaveGame() {
  try { await game.autoSave(); saved.value = true; setTimeout(() => saved.value = false, 2000) } catch {}
}

function handleThemeReset() {
  theme.resetToDefault()
  themeMsg.value = '✅ 已恢复默认粉色主题'
}

function handleThemeImport() {
  themeMsg.value = ''
  if (!themeJson.value.trim()) return
  const ok = theme.importThemeJson(themeJson.value)
  themeMsg.value = ok ? '✅ 主题已应用' : '❌ JSON 解析失败'
  if (ok) themeJson.value = ''
}

// ---- extensions ----
const marketAvailable = computed(() =>
  MARKETPLACE.filter(m => !extStore.isInstalled(m.id))
)

function installFromMarket(id: string) {
  extStore.install(id)
  extStore.setEnabled(id, true)
}

const CARDS = [
  { key: 'api', icon: '🔌', cn: 'API 配置', en: 'API CONFIG', desc: 'LLM 接口、密钥、模型' },
  { key: 'prompt', icon: '📜', cn: '系统提示词', en: 'SYSTEM PROMPT', desc: 'AI 世界观、风格和行为' },
  { key: 'worldbook', icon: '📖', cn: '全局世界书', en: 'GLOBAL WB', desc: '所有世界通用的背景知识' },
  { key: 'extensions', icon: '🧩', cn: '扩展管理', en: 'EXTENSIONS', desc: '' },
  { key: 'theme', icon: '🎨', cn: '聊天主题', en: 'THEME', desc: '' },
] as const

function collapse() { expandedKey.value = null }

function closeSettings() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

const EXPAND_TITLES: Record<string, string> = { api:'🔌 API 配置', prompt:'📜 系统提示词', worldbook:'📖 全局世界书', extensions:'🧩 扩展管理', theme:'🎨 聊天主题' }
</script>

<template>
  <div class="ss">
    <div class="ss-bg"></div>

    <!-- home -->
    <div v-if="expandedKey === null" class="ss-main">
      <header class="ss-head">
        <span></span>
        <div class="ss-title"><h1>⚙️ 设置</h1><p>SETTINGS</p></div>
        <button class="ss-close" @click="closeSettings">✕</button>
      </header>
      <div class="card-grid">
        <button v-for="c in CARDS" :key="c.key" class="s-card glass-panel" @click="expandedKey = c.key">
          <span class="s-icon">{{ c.icon }}</span>
          <div class="s-labels"><span class="s-cn">{{ c.cn }}</span><span class="s-en">{{ c.en }}</span></div>
          <p class="s-desc">{{ c.key === 'theme' ? (theme.isCustom ? '自定义' : 'bjd粉色') : c.key === 'extensions' ? `${extStore.enabledCount}/${extStore.totalCount} 已启用` : c.desc }}</p>
          <span class="s-arrow">→</span>
        </button>
      </div>
      <div class="ss-foot">
        <button v-if="hasActiveGame" class="ss-btn" @click="handleSaveGame">💾 手动存档</button>
        <button class="ss-btn" @click="handleSave">保存设置</button>
        <span v-if="saved" style="font-size:12px;color:var(--success);margin-left:8px">✅ 已保存</span>
      </div>
    </div>

    <!-- expanded detail -->
    <div v-if="expandedKey" class="ss-expand">
      <header class="ex-head">
        <button class="ex-back" @click="collapse">← 返回</button>
        <h2>{{ EXPAND_TITLES[expandedKey] }}</h2>
        <span></span>
      </header>
      <div class="ex-body">

        <!-- API -->
        <div v-if="expandedKey === 'api'" class="form-card glass-panel">
          <div class="fg"><label>API Key <span class="l-en">AUTH</span></label><input v-model="editApiKey" type="password" class="fi" placeholder="sk-..." /></div>
          <div class="fg"><label>API 地址 <span class="l-en">ENDPOINT</span></label><input v-model="editBaseUrl" type="text" class="fi" /></div>
          <div class="fg"><label>模型 <span class="l-en">MODEL</span></label><input v-model="editModel" type="text" class="fi" /></div>
          <div class="fg-row">
            <div class="fg" style="flex:1"><label>温度 {{ editTemperature }}</label><input v-model.number="editTemperature" type="range" min="0" max="2" step="0.1" style="width:100%;accent-color:var(--theme-text-accent)" /></div>
            <div class="fg" style="flex:1"><label>Max Tokens</label><input v-model.number="editMaxTokens" type="number" class="fi" min="256" max="128000" /></div>
          </div>
          <button class="sub-save" @click="handleSave">保存</button>

          <div style="margin-top:18px; padding-top:16px; border-top:1px solid var(--theme-border-ice)">
            <label style="font-size:12px;color:var(--theme-text-main);font-weight:500;margin-bottom:8px;display:block">📋 预设模板 <span class="l-en">PRESETS</span></label>
            <div style="display:flex;gap:6px;margin-bottom:10px">
              <input v-model="presetName" class="fi" placeholder="预设名称..." style="flex:1;margin-bottom:0" @keydown.enter="handleSavePreset" />
              <button class="act go" style="white-space:nowrap" @click="handleSavePreset">💾 保存当前</button>
            </div>
            <span v-if="presetMsg" style="font-size:11px;color:var(--success)">{{ presetMsg }}</span>
            <div v-if="presets.length === 0" style="font-size:11px;color:var(--theme-text-main);opacity:0.4">暂无预设，填写 API 配置后保存为模板</div>
            <div v-for="p in presets" :key="p.name" style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,0.4);margin-bottom:4px">
              <span style="flex:1;font-size:13px;color:var(--theme-text-main);font-weight:500">{{ p.name }}</span>
              <span style="font-size:10px;color:var(--theme-text-main);opacity:0.4">{{ p.apiConfig.model }}</span>
              <button class="act" @click="handleApplyPreset(p.name)">应用</button>
              <button class="act" style="color:#c88" @click="handleDeletePreset(p.name)">✕</button>
            </div>
          </div>
        </div>

        <!-- Prompt -->
        <div v-if="expandedKey === 'prompt'" class="form-card glass-panel">
          <p style="font-size:12px;color:var(--theme-text-main);margin:0 0 12px">提示词决定 AI 的世界观、风格和行为。</p>
          <div class="fg"><textarea v-model="editSystemPrompt" class="fi fi-ta" rows="22" style="font-family:monospace;font-size:12px"></textarea></div>
          <button class="sub-save" @click="handleSave">保存</button>
        </div>

        <!-- WorldBook -->
        <div v-if="expandedKey === 'worldbook'" class="form-card glass-panel">
          <WorldBookManager />
        </div>

        <!-- Theme -->
        <div v-if="expandedKey === 'theme'" class="form-card glass-panel">
          <p style="font-size:13px;color:var(--theme-text-main);margin:0 0 16px">
            系统内置 <strong>🎀 bjd粉色</strong> 作为默认主题。粘贴 ST 格式的主题 JSON 可导入自定义主题，覆盖默认样式。
          </p>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,0.4)">
            <span style="font-size:13px;color:var(--theme-text-main)">当前：<strong>{{ theme.isCustom ? '✨ 自定义主题' : '🎀 bjd粉色（默认）' }}</strong></span>
            <button v-if="theme.isCustom" class="act" style="color:#c88;margin-left:auto" @click="handleThemeReset">恢复默认</button>
          </div>
          <hr style="border:1px solid var(--theme-border-ice);margin:0 0 16px" />
          <div class="fg">
            <label>导入主题 JSON <span class="l-en">IMPORT</span></label>
            <textarea v-model="themeJson" class="fi fi-ta" rows="8" placeholder="粘贴 SillyTavern 风格的主题 JSON..." style="font-family:monospace;font-size:12px"></textarea>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <button class="sub-save" style="margin-top:0;width:auto;padding:9px 20px" @click="handleThemeImport">导入并应用</button>
            <span v-if="themeMsg" :style="{fontSize:'12px',color:themeMsg.startsWith('✅')?'var(--success)':'var(--danger)'}">{{ themeMsg }}</span>
          </div>
        </div>

        <!-- Extensions -->
        <div v-if="expandedKey === 'extensions'" class="form-card glass-panel">
          <p style="font-size:12px;color:var(--theme-text-main);margin:0 0 14px">扩展为 wandou 添加额外功能。从市场安装，按需启用。</p>
          <div class="ext-sec-title">📦 已安装</div>
          <div v-if="extStore.installed.length === 0" style="font-size:11px;color:var(--theme-text-main);opacity:0.4;padding:8px 0">尚未安装任何扩展</div>
          <div v-for="e in extStore.installed" :key="e.manifest.id" :class="['ext-item', { off: !e.enabled }]">
            <div class="ext-item-row">
              <ToggleSwitch :modelValue="e.enabled" @update:modelValue="extStore.toggle(e.manifest.id)" />
              <span class="ext-item-icon">{{ e.manifest.icon }}</span>
              <div class="ext-item-info">
                <span class="ext-item-name">{{ e.manifest.name }}</span>
                <span class="ext-item-meta">v{{ e.manifest.version }} · {{ e.manifest.author }}</span>
              </div>
              <button class="act" style="color:#c88;font-size:11px" @click="extStore.uninstall(e.manifest.id)">卸载</button>
            </div>
            <p class="ext-item-desc">{{ e.manifest.description }}</p>
          </div>
          <div class="ext-sec-title" style="margin-top:20px">🛒 扩展市场</div>
          <div v-if="marketAvailable.length === 0" style="font-size:11px;color:var(--theme-text-main);opacity:0.4;padding:8px 0">所有扩展已安装 🎉</div>
          <div v-for="m in marketAvailable" :key="m.id" class="ext-item">
            <div class="ext-item-row">
              <span class="ext-item-icon">{{ m.icon }}</span>
              <div class="ext-item-info">
                <span class="ext-item-name">{{ m.name }}</span>
                <span class="ext-item-meta">v{{ m.version }} · {{ m.author }}</span>
              </div>
              <button class="act go" style="font-size:11px" @click="installFromMarket(m.id)">安装</button>
            </div>
            <p class="ext-item-desc">{{ m.description }}</p>
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
.ss-title p { font-size: 11px; color: var(--theme-border-light); letter-spacing: 0.2em; margin: 2px 0 0; }
.ss-close { width: 36px; height: 36px; border-radius: 50%; font-size: 16px; color: var(--theme-text-main); cursor: pointer; border: 1px solid var(--theme-border-ice); background: rgba(255,255,255,0.5); display: flex; align-items: center; justify-content: center; }
.ss-close:active { background: rgba(255,128,168,0.1); color: var(--theme-text-accent); }

/* ---- cards ---- */
.card-grid { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 12px 0; align-content: center; max-width: 640px; width: 100%; margin: 0 auto; }
.s-card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px 16px; border-radius: 20px; cursor: pointer; font-family: inherit; text-align: center; transition: all 0.3s; position: relative; min-height: 150px; background: rgba(255,255,255,0.6); border: 1px solid var(--theme-border-ice); }
.s-card:active { transform: translateY(-3px); border-color: var(--theme-text-accent); box-shadow: 0 8px 25px rgba(255,128,168,0.18); }
.s-icon { font-size: 30px; }
.s-labels { display: flex; flex-direction: column; gap: 2px; }
.s-cn { font-size: 15px; font-weight: 600; color: var(--theme-text-main); }
.s-en { font-size: 9px; color: var(--theme-text-main); opacity: 0.45; letter-spacing: 0.12em; }
.s-desc { font-size: 10px; color: var(--theme-text-main); opacity: 0.45; margin: 0; line-height: 1.4; max-width: 180px; }
.s-arrow { position: absolute; top: 10px; right: 14px; font-size: 14px; color: var(--theme-text-main); opacity: 0.35; transition: all 0.3s; }
.s-card:active .s-arrow { opacity: 0.8; transform: translateX(3px); }

/* ---- foot ---- */
.ss-foot { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 10px 0; flex-shrink: 0; }
.ss-btn { padding: 8px 18px; border-radius: 20px; border: 1px solid var(--theme-border-ice); background: rgba(255,255,255,0.5); color: var(--theme-text-main); font-size: 12px; cursor: pointer; font-family: inherit; transition: all 0.2s; }
.ss-btn:active { background: var(--theme-border-ice); border-color: var(--theme-border-light); }

/* ---- expanded detail ---- */
.ss-expand { position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%; padding: 0 16px 16px; overflow: hidden; animation: slideRightIn 0.2s ease-out; }
@keyframes slideRightIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
.ex-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; flex-shrink: 0; border-bottom: 1px solid var(--theme-border-ice); }
.ex-head h2 { font-size: 18px; color: #e0e8ff; margin: 0; }
.ex-back { padding: 6px 14px; border-radius: 20px; border: 1px solid var(--theme-border-ice); background: rgba(255,255,255,0.5); color: var(--theme-text-main); font-size: 12px; cursor: pointer; font-family: inherit; }
.ex-back:active { background: var(--theme-border-ice); }
.ex-body { flex: 1; overflow-y: auto; padding: 16px 0; max-width: 540px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; }

/* ---- form ---- */
.form-card { padding: 20px; border-radius: 16px; background: rgba(255,255,255,0.55); border: 1px solid var(--theme-border-ice); flex: 1; min-height: 0; display: flex; flex-direction: column; }
.fg { margin-bottom: 14px; }
.fg label { display: block; font-size: 12px; color: var(--theme-text-main); margin-bottom: 4px; font-weight: 500; }
.l-en { font-size: 8px; color: var(--theme-text-main); opacity: 0.35; letter-spacing: 0.1em; margin-left: 4px; }
.fi { width: 100%; padding: 9px 11px; border: 1px solid var(--theme-border-ice); border-radius: 10px; background: rgba(255,255,255,0.5); color: var(--theme-text-main); font-size: 14px; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s; }
.fi:focus { outline: none; border-color: var(--theme-text-accent); box-shadow: 0 0 0 2px rgba(255,128,168,0.08); }
.fi-ta { resize: vertical; min-height: 60px; }
.fg-row { display: flex; gap: 12px; }
.sub-save { width: 100%; margin-top: 8px; padding: 10px; border: none; border-radius: 20px; background: var(--theme-text-accent); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.2s; }
.sub-save:active { transform: scale(0.97); opacity: 0.9; }

/* ---- extensions ---- */
.ext-sec-title { font-size: 13px; font-weight: 600; color: var(--theme-text-main); margin: 0 0 8px; }
.ext-item { padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.4); margin-bottom: 6px; transition: all 0.2s; }
.ext-item.off { opacity: 0.45; }
.ext-item-row { display: flex; align-items: center; gap: 10px; }
.ext-item-icon { font-size: 20px; flex-shrink: 0; }
.ext-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ext-item-name { font-size: 13px; font-weight: 600; color: var(--theme-text-main); }
.ext-item-meta { font-size: 10px; color: var(--theme-text-main); opacity: 0.45; }
.ext-item-desc { font-size: 11px; color: var(--theme-text-main); opacity: 0.55; margin: 4px 0 0; padding-left: 30px; line-height: 1.4; }

@media (max-width: 500px) { .card-grid { grid-template-columns: 1fr; gap: 10px; } .s-card { min-height: 100px; padding: 18px 12px; } }
</style>
