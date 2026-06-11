<!-- wandou · 设置面板 -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import WorldBookManager from './WorldBookManager.vue'

const store = useGameStore()
const emit = defineEmits<{ close: [] }>()
const hasActiveGame = computed(() => store.messages.length > 0)
const page = ref<string | null>(null)

const editApiKey = ref(store.apiConfig.apiKey)
const editBaseUrl = ref(store.apiConfig.baseUrl)
const editModel = ref(store.apiConfig.model)
const editTemperature = ref(store.apiConfig.temperature)
const editMaxTokens = ref(store.apiConfig.maxTokens)
const editSystemPrompt = ref(store.systemPrompt)
const saved = ref(false)

function handleSave() {
  store.updateApiConfig({ apiKey: editApiKey.value, baseUrl: editBaseUrl.value, model: editModel.value, temperature: editTemperature.value, maxTokens: editMaxTokens.value })
  store.updateSystemPrompt(editSystemPrompt.value)
  saved.value = true; setTimeout(() => saved.value = false, 2000)
}
async function handleSaveGame() {
  try { await store.autoSave(); saved.value = true; setTimeout(() => saved.value = false, 2000) } catch {}
}

const CARDS = [
  { key: 'api', icon: '🔌', cn: 'API 配置', en: 'API CONFIG', desc: 'LLM 接口、密钥、模型' },
  { key: 'prompt', icon: '📜', cn: '系统提示词', en: 'SYSTEM PROMPT', desc: 'AI 世界观、风格和行为' },
  { key: 'worldbook', icon: '📖', cn: '全局世界书', en: 'GLOBAL WB', desc: '所有世界通用的背景知识' },
  { key: 'theme', icon: '🎨', cn: '聊天主题', en: 'THEME', desc: store.themeId === 'bjd-pink' ? '当前：bjd粉色' : '当前：wandou暗色' },
]

function goBack() { page.value = null }
</script>

<template>
  <div class="ss">
    <div class="ss-bg"></div>

    <div v-if="page === null" class="ss-main">
      <header class="ss-head">
        <span></span>
        <div class="ss-title"><h1>⚙️ 设置</h1><p>SETTINGS</p></div>
        <button class="ss-close" @click="emit('close')">✕</button>
      </header>

      <div class="card-grid">
        <button v-for="c in CARDS" :key="c.key" class="s-card glass-panel corner-deco" @click="c.key === 'theme' ? store.applyTheme(store.themeId === 'bjd-pink' ? 'wandou-dark' : 'bjd-pink') : (page = c.key)">
          <span class="s-icon">{{ c.icon }}</span>
          <div class="s-labels"><span class="s-cn">{{ c.cn }}</span><span class="s-en">{{ c.en }}</span></div>
          <p class="s-desc">{{ c.desc }}</p>
          <span class="s-arrow">→</span>
        </button>
      </div>

      <div class="ss-foot">
        <button v-if="hasActiveGame" class="ss-btn" @click="handleSaveGame">💾 手动存档</button>
        <button class="ss-btn" @click="handleSave">保存设置</button>
        <span v-if="saved" style="font-size:12px;color:var(--success);margin-left:8px">✅ 已保存</span>
      </div>
    </div>

    <!-- sub-pages -->
    <div v-if="page" class="sub">
      <header class="sub-head">
        <button class="sub-back" @click="goBack">← 返回</button>
        <h2>{{ {api:'🔌 API 配置',prompt:'📜 系统提示词',worldbook:'📖 全局世界书'}[page] }}</h2>
        <span></span>
      </header>
      <div class="sub-body">
        <div v-if="page === 'api'" class="form-card glass-panel corner-deco">
          <div class="fg"><label>API Key <span class="l-en">AUTH</span></label><input v-model="editApiKey" type="password" class="fi" placeholder="sk-..." /></div>
          <div class="fg"><label>API 地址 <span class="l-en">ENDPOINT</span></label><input v-model="editBaseUrl" type="text" class="fi" /></div>
          <div class="fg"><label>模型 <span class="l-en">MODEL</span></label><input v-model="editModel" type="text" class="fi" /></div>
          <div class="fg-row">
            <div class="fg" style="flex:1"><label>温度 {{ editTemperature }}</label><input v-model.number="editTemperature" type="range" min="0" max="2" step="0.1" style="width:100%;accent-color:var(--accent-cyan)" /></div>
            <div class="fg" style="flex:1"><label>Max Tokens</label><input v-model.number="editMaxTokens" type="number" class="fi" min="256" max="128000" /></div>
          </div>
          <button class="sub-save" @click="handleSave">保存</button>
        </div>

        <div v-if="page === 'prompt'" class="form-card glass-panel corner-deco">
          <p style="font-size:12px;color:var(--text-secondary);margin:0 0 12px">提示词决定 AI 的世界观、风格和行为。</p>
          <div class="fg"><textarea v-model="editSystemPrompt" class="fi fi-ta" rows="22" style="font-family:monospace;font-size:12px"></textarea></div>
          <button class="sub-save" @click="handleSave">保存</button>
        </div>

        <div v-if="page === 'worldbook'" class="form-card glass-panel corner-deco">
          <WorldBookManager />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ss { position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column; overflow: hidden; background: url('/splash-bg.png') center/cover no-repeat; }
.ss::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: -1; background: radial-gradient(ellipse at 50% 50%, rgba(8,14,24,0.65) 0%, rgba(8,14,24,0.3) 65%, transparent 100%); }
.ss-bg { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.5), transparent),
              radial-gradient(1px 1px at 30% 50%, rgba(255,255,255,0.3), transparent),
              radial-gradient(1px 1px at 55% 25%, rgba(255,255,255,0.4), transparent),
              radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.35), transparent),
              radial-gradient(1px 1px at 85% 35%, rgba(255,255,255,0.4), transparent); }

.ss-main { position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%; padding: 16px; }
.ss-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; flex-shrink: 0; }
.ss-title { text-align: center; }
.ss-title h1 { font-size: 22px; font-weight: 700; color: var(--text-primary); margin: 0; }
.ss-title p { font-size: 11px; color: var(--text-muted); letter-spacing: 0.2em; margin: 2px 0 0; }
.ss-close { width: 36px; height: 36px; border-radius: 10px; font-size: 18px; color: var(--text-secondary); cursor: pointer; border: 1px solid var(--glass-border); background: var(--glass-bg); display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
.ss-close:active { background: rgba(200,60,60,0.2); color: #e08080; }

.card-grid { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px 8px; align-content: center; max-width: 680px; width: 100%; margin: 0 auto; }
.s-card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 28px 16px; border-radius: 16px; cursor: pointer; font-family: inherit; text-align: center; transition: all 0.3s; position: relative; min-height: 160px; }
.s-card:active { transform: translateY(-2px); border-color: var(--accent-cyan); box-shadow: 0 0 20px var(--accent-cyan-glow); }
.s-icon { font-size: 32px; }
.s-labels { display: flex; flex-direction: column; gap: 2px; }
.s-cn { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.s-en { font-size: 10px; color: var(--text-muted); letter-spacing: 0.12em; }
.s-desc { font-size: 11px; color: var(--text-muted); margin: 0; line-height: 1.4; max-width: 200px; }
.s-arrow { position: absolute; top: 12px; right: 16px; font-size: 16px; color: var(--text-muted); transition: all 0.3s; }
.s-card:active .s-arrow { color: var(--accent-cyan); transform: translateX(3px); }

.ss-foot { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 12px 16px; flex-shrink: 0; }
.ss-btn { padding: 7px 16px; border-radius: 8px; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-secondary); font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.2s; }
.ss-btn:active { border-color: var(--accent); color: var(--text-primary); }

.sub { position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%; }
.sub-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; flex-shrink: 0; border-bottom: 1px solid var(--glass-border); }
.sub-head h2 { font-size: 18px; color: var(--text-primary); margin: 0; }
.sub-back { padding: 6px 14px; border-radius: 8px; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-secondary); font-size: 13px; cursor: pointer; font-family: inherit; }
.sub-back:active { border-color: var(--accent); color: var(--text-primary); }
.sub-body { flex: 1; overflow-y: auto; padding: 20px; max-width: 540px; width: 100%; margin: 0 auto; }

.form-card { padding: 20px; border-radius: 14px; }
.fg { margin-bottom: 14px; }
.fg label { display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 4px; font-weight: 500; }
.l-en { font-size: 9px; color: var(--text-muted); letter-spacing: 0.1em; margin-left: 4px; }
.fi { width: 100%; padding: 9px 11px; border: 1px solid var(--border); border-radius: 6px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 14px; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s; }
.fi:focus { outline: none; border-color: var(--accent-cyan); box-shadow: 0 0 0 2px rgba(0,229,255,0.1); }
.fi-ta { resize: vertical; min-height: 60px; }
.fg-row { display: flex; gap: 12px; }
.sub-save { width: 100%; margin-top: 8px; padding: 9px; border: 1px solid var(--accent-cyan); border-radius: 8px; background: rgba(0,229,255,0.08); color: var(--accent-cyan); font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.2s; }
.sub-save:active { background: rgba(0,229,255,0.18); }

@media (max-width: 500px) { .card-grid { grid-template-columns: 1fr; gap: 10px; } .s-card { min-height: 100px; padding: 18px 12px; } }
</style>
