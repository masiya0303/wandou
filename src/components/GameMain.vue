<!-- wandou · 游戏主界面 -->
<script setup lang="ts">
import { useGameStore } from '../stores/gameStore'
import ChatPanel from './ChatPanel.vue'
import InputBar from './InputBar.vue'
import GameHud from './GameHud.vue'

const store = useGameStore()
const emit = defineEmits<{ openSettings: [] }>()
async function goHome() { await store.autoSave(); store.phase = 'start' }
</script>

<template>
  <div class="game">
    <div class="bg-vignette"></div>
    <header class="bar">
      <span class="bar-left">
        <button class="bar-btn" @click="goHome" title="主菜单">🏠</button>
        <span class="bar-title">{{ store.worldName || '豌豆号' }}</span>
      </span>
      <span class="bar-right">
        <button class="bar-btn" @click="store.goToWorldDetail()" title="世界管理">📋</button>
        <button class="bar-btn" @click="emit('openSettings')" title="设置">⚙️</button>
      </span>
    </header>
    <ChatPanel />
    <InputBar />
    <GameHud />
  </div>
</template>

<style scoped>
.game { display: flex; flex-direction: column; height: 100vh; background: url('/splash-bg.png') center/cover no-repeat; position: relative; overflow: hidden; }
.bar { display: flex; align-items: center; justify-content: space-between; padding: 0 14px; height: 44px; flex-shrink: 0; z-index: 20; background: rgba(255,255,255,0.7); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-bottom: 1px solid var(--pink-ice); }
.bar-left, .bar-right { display: flex; align-items: center; gap: 8px; }
.bar-title { font-size: 15px; font-weight: 600; color: var(--pink-primary); }
.bar-btn { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--pink-light); background: rgba(255,255,255,0.5); color: var(--pink-primary); font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.bar-btn:active { transform: scale(0.94); background: var(--pink-ice); }
</style>
