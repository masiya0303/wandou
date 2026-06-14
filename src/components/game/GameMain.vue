<!-- wandou · 游戏主界面 -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'
import { useWorldStore } from '@/stores/worldStore'
import ChatPanel from './ChatPanel.vue'
import InputBar from './InputBar.vue'
import GameHud from './GameHud.vue'

const props = defineProps<{ id: string }>()
const router = useRouter()
const route = useRoute()
const game = useGameStore()
const world = useWorldStore()
const loaded = ref(false)
const loadError = ref('')

// ---- 自动存档（纯后台，只写 auto） ----
function onBeforeUnload() { game.syncSave('auto') }
const SAVE_INTERVAL = 30000
let saveTimer: ReturnType<typeof setInterval> | null = null
function autoSave() { game.syncSave('auto') }

// ---- 存档弹窗 ----
const showSave = ref(false)
const saveSlots = ref<{ name: string; timestamp: number; preview: string }[]>([])

function openSave() {
  // 清理旧的 auto.1/auto.2/auto.3（迁移到单 auto 模式）
  for (const old of ['auto.1', 'auto.2', 'auto.3']) {
    game.deleteSlot(world.currentWorldId!, old)
  }
  saveSlots.value = game.listSlots(world.currentWorldId!)
  showSave.value = true
}
function closeSave() { showSave.value = false }

function handleSave(slotName: string) {
  game.syncSave(slotName)
  saveSlots.value = game.listSlots(world.currentWorldId!)
}

function handleLoad(slotName: string) {
  if (!confirm(`读取「${slotName}」？\n当前进度会丢失。`)) return
  game.loadFromSlot(slotName, world.currentWorldId!).then(ok => {
    if (ok) window.location.reload()
  })
}

function handleDelete(slotName: string) {
  if (!confirm(`删除存档「${slotName}」？`)) return
  game.deleteSlot(world.currentWorldId!, slotName)
  saveSlots.value = game.listSlots(world.currentWorldId!)
}

function handleNewSlot() {
  const name = prompt('存档名：', `存档${saveSlots.value.length + 1}`)
  if (!name?.trim()) return
  game.syncSave(name.trim())
  saveSlots.value = game.listSlots(world.currentWorldId!)
}

const manualSlots = computed(() => saveSlots.value.filter(s => s.name !== 'auto'))

function fmt(ts: number) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-CN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
}

// ---- 生命周期 ----
onMounted(async () => {
  const slot = route.query.slot as string | undefined
  if (props.id && props.id !== world.currentWorldId) {
    let ok = false
    if (slot) {
      ok = await game.loadFromSlot(slot, props.id)
      if (!ok) { loadError.value = `存档「${slot}」加载失败`; return }
    } else {
      ok = await game.enterWorld(props.id)
    }
    if (!ok) { loadError.value = '存档加载失败'; return }
  }
  if (!world.currentWorldId) { loadError.value = '没有加载中的世界'; return }
  loaded.value = true
  saveTimer = setInterval(autoSave, SAVE_INTERVAL)
  window.addEventListener('beforeunload', onBeforeUnload)
})

onUnmounted(() => {
  if (saveTimer) { clearInterval(saveTimer); saveTimer = null }
  window.removeEventListener('beforeunload', onBeforeUnload)
  game.syncSave('auto')
})

async function goHome() { game.syncSave('auto'); router.push('/') }
function goToWorldDetail() { router.push({ name: 'worldDetail', params: { id: world.currentWorldId! } }) }
function openSettings() { router.push('/settings') }
</script>

<template>
  <div v-if="!loaded" class="game game-center">
    <div v-if="loadError" class="err-page">
      <p class="err-msg">{{ loadError }}</p>
      <button class="err-back" @click="router.push('/')">← 返回主菜单</button>
    </div>
    <div v-else class="loading-page">
      <span class="loading-dot"></span>
      <p>正在加载世界...</p>
    </div>
  </div>

  <div v-else class="game">
    <div class="bg-vignette"></div>
    <header class="bar">
      <span class="bar-left">
        <button class="bar-btn" @click="goHome" title="主菜单">🏠</button>
        <span class="bar-title">{{ world.worldName || '地球online' }}</span>
      </span>
      <span class="bar-right">
        <button class="bar-btn" @click="openSave" title="存档">💾</button>
        <button class="bar-btn" @click="goToWorldDetail" title="世界管理">📋</button>
        <button class="bar-btn" @click="openSettings" title="设置">⚙️</button>
      </span>
    </header>
    <ChatPanel />
    <InputBar />
    <GameHud />

    <!-- 存档弹窗 -->
    <Teleport to="body">
      <Transition name="pop">
        <div v-if="showSave" class="pop-bg" @click.self="closeSave">
          <div class="pop-card">
            <div class="pop-head">
              <span class="pop-title">💾 存档</span>
              <span class="pop-sub">· {{ world.worldName }}</span>
              <span class="pop-spacer"></span>
              <button class="pop-close" @click="closeSave">✕</button>
            </div>

            <!-- 自动存档（只读，仅用于回退） -->
            <div class="pop-group">
              <span class="pop-label">🤖 自动存档（每30秒）</span>
              <div class="slot-row muted">
                <span class="slot-name">auto</span>
                <span class="slot-prev">{{ saveSlots.find(s => s.name === 'auto')?.preview || '暂无' }}</span>
                <span class="slot-time">{{ fmt(saveSlots.find(s => s.name === 'auto')?.timestamp || 0) }}</span>
                <button class="slot-btn load" @click="handleLoad('auto')" title="回退到自动存档">📂</button>
              </div>
            </div>

            <!-- 手动存档 -->
            <div class="pop-group">
              <span class="pop-label">💾 手动存档</span>
              <div v-if="manualSlots.length === 0" class="pop-empty">暂无手动存档</div>
              <div v-for="s in manualSlots" :key="s.name" class="slot-row">
                <span class="slot-name">{{ s.name }}</span>
                <span class="slot-prev">{{ s.preview }}</span>
                <span class="slot-time">{{ fmt(s.timestamp) }}</span>
                <button class="slot-btn save" @click="handleSave(s.name)" title="覆盖保存">💾</button>
                <button class="slot-btn load" @click="handleLoad(s.name)" title="读取">📂</button>
                <button class="slot-btn del" @click="handleDelete(s.name)" title="删除">🗑️</button>
              </div>
              <button class="pop-new" @click="handleNewSlot">＋ 新建存档</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.game { display: flex; flex-direction: column; height: 100vh; background: var(--theme-chat-bg) center/cover no-repeat; position: relative; overflow: hidden; }
.game-center { align-items: center; justify-content: center; }

.loading-page { display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--theme-text-main); font-size: 14px; }
.loading-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--theme-text-accent); animation: dotPulse 1s ease-in-out infinite; }
@keyframes dotPulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }

.err-page { text-align: center; }
.err-msg { font-size: 15px; color: #e88; margin-bottom: 16px; }
.err-back { padding: 8px 20px; border-radius: 9999px; border: 1px solid var(--theme-border-light); background: rgba(255,255,255,0.6); color: var(--theme-text-main); font-size: 14px; cursor: pointer; font-family: inherit; }

.bar { display: flex; align-items: center; justify-content: space-between; padding: 0 14px; height: 44px; flex-shrink: 0; z-index: 20; background: rgba(255,255,255,0.7); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-bottom: 1px solid var(--theme-border-ice); }
.bar-left, .bar-right { display: flex; align-items: center; gap: 8px; }
.bar-title { font-size: 15px; font-weight: 600; color: var(--theme-text-main); }
.bar-btn { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--theme-border-light); background: rgba(255,255,255,0.5); color: var(--theme-text-main); font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.bar-btn:active { transform: scale(0.94); background: var(--theme-border-ice); }

/* 弹窗 */
.pop-bg { position: fixed; inset: 0; z-index: 400; background: rgba(0,0,0,0.35); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; }
.pop-card { width: 100%; max-width: 380px; max-height: 80vh; overflow-y: auto; border-radius: 20px; background: linear-gradient(170deg, rgba(255,250,252,0.98), rgba(255,235,242,0.96)); padding: 18px 20px; box-shadow: 0 12px 48px rgba(0,0,0,0.15); }
.pop-head { display: flex; align-items: baseline; gap: 4px; margin-bottom: 16px; }
.pop-title { font-size: 18px; font-weight: 700; color: var(--theme-text-main); }
.pop-sub { font-size: 11px; color: var(--theme-text-main); opacity: 0.35; }
.pop-spacer { flex: 1; }
.pop-close { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--theme-border-light); background: none; cursor: pointer; font-size: 14px; color: var(--theme-text-main); display: flex; align-items: center; justify-content: center; }
.pop-close:hover { color: #e55; }

.pop-group { margin-bottom: 14px; }
.pop-label { font-size: 11px; font-weight: 600; color: var(--theme-text-accent); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; display: block; }
.pop-empty { padding: 8px; font-size: 12px; color: var(--theme-text-main); opacity: 0.4; text-align: center; }
.pop-new { width: 100%; padding: 8px; border: 1px dashed var(--theme-border-light); border-radius: 10px; background: none; color: var(--theme-text-main); font-size: 13px; cursor: pointer; font-family: inherit; opacity: 0.5; margin-top: 6px; }
.pop-new:active { opacity: 1; border-color: var(--theme-text-accent); }

.slot-row { display: flex; align-items: center; gap: 6px; padding: 8px 10px; margin-bottom: 4px; border-radius: 10px; background: rgba(255,255,255,0.5); border: 1px solid var(--theme-border-ice); }
.slot-row.muted { opacity: 0.6; background: rgba(255,255,255,0.3); }
.slot-name { font-size: 13px; font-weight: 600; color: var(--theme-text-main); flex-shrink: 0; min-width: 40px; }
.slot-prev { flex: 1; font-size: 11px; color: var(--theme-text-main); opacity: 0.5; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slot-time { font-size: 10px; color: var(--theme-text-main); opacity: 0.3; flex-shrink: 0; }
.slot-btn { width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--theme-border-ice); background: rgba(255,255,255,0.7); cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s; }
.slot-btn:active { transform: scale(0.9); }
.slot-btn.save:active { background: rgba(76,175,80,0.15); border-color: #4caf50; }
.slot-btn.load:active { background: rgba(33,150,243,0.15); border-color: #2196f3; }
.slot-btn.del:active { background: rgba(244,67,54,0.15); border-color: #f44336; }

/* transition */
.pop-enter-active { transition: all 0.2s ease-out; }
.pop-leave-active { transition: all 0.15s ease-in; }
.pop-enter-from, .pop-leave-to { opacity: 0; }
.pop-enter-from .pop-card { transform: scale(0.92); }
.pop-leave-to .pop-card { transform: scale(0.96); }
</style>
