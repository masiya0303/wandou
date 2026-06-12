<!-- wandou · 游戏主界面 -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'
import { useWorldStore } from '@/stores/worldStore'
import ChatPanel from './ChatPanel.vue'
import InputBar from './InputBar.vue'
import GameHud from './GameHud.vue'

const props = defineProps<{ id: string }>()
const router = useRouter()
const game = useGameStore()
const world = useWorldStore()
const loaded = ref(false)
const loadError = ref('')

// 刷新 / 关闭前自动保存
function onBeforeUnload() {
  game.syncSave()
}
const SAVE_INTERVAL = 30000 // 每 30 秒自动保存
let saveTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  // 恢复当前游戏状态（刷新页面时 store 已清空，从 localStorage 恢复）
  if (props.id && props.id !== world.currentWorldId) {
    const ok = await game.enterWorld(props.id)
    if (!ok) {
      loadError.value = '存档加载失败，请返回主菜单'
      return
    }
  }
  // 如果已经在游戏中（从世界详情页跳转来的），不需要重新加载
  if (!world.currentWorldId) {
    loadError.value = '没有加载中的世界'
    return
  }
  loaded.value = true

  // 定时自动保存 + 关闭前保存
  saveTimer = setInterval(() => game.syncSave(), SAVE_INTERVAL)
  window.addEventListener('beforeunload', onBeforeUnload)
})

onUnmounted(() => {
  if (saveTimer) { clearInterval(saveTimer); saveTimer = null }
  window.removeEventListener('beforeunload', onBeforeUnload)
  game.syncSave() // 离开页面前最后一次保存
})

async function goHome() {
  await game.autoSave()
  router.push('/')
}

function goToWorldDetail() {
  router.push({ name: 'worldDetail', params: { id: world.currentWorldId! } })
}

function openSettings() {
  router.push('/settings')
}
</script>

<template>
  <!-- 加载中 / 错误 -->
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
        <button class="bar-btn" @click="goToWorldDetail" title="世界管理">📋</button>
        <button class="bar-btn" @click="openSettings" title="设置">⚙️</button>
      </span>
    </header>
    <ChatPanel />
    <InputBar />
    <GameHud />
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
</style>
